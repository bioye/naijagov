package com.naijagov.naijagov.repository;

import com.naijagov.naijagov.model.LocalGov;
import com.naijagov.naijagov.model.Ward;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.repository.PagingAndSortingRepository;
import org.springframework.stereotype.Repository;

@Repository("wardRepository")
public interface WardRepository extends PagingAndSortingRepository<Ward, Integer>{

	public Page<Ward> findByLocalGov(Pageable page, LocalGov localGov);

}