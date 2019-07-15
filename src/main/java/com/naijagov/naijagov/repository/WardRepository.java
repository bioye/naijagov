package com.naijagov.naijagov.repository;

import com.naijagov.naijagov.model.Ward;
import org.springframework.data.repository.PagingAndSortingRepository;
import org.springframework.stereotype.Repository;

@Repository("wardRepository")
public interface WardRepository extends PagingAndSortingRepository<Ward, Integer>{

}